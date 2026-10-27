/**
 * The watchdog of a nightly run (plan §4.8): every 30 s it reads facts the lanes cannot reach and
 * writes the flags the QA gate reads. The gate can be walked around through a site -> `tracy-web`,
 * so these checks look at the stand itself, not at the gate's own counters only.
 *
 *   - sites: the stand's site labels (Docker / `site` table, a probe) against the gate's site book
 *     (`state/sites.jsonl`); a QA-looking site with no book row -> one `orphan` line in the book and
 *     every lane is stopped; a lane over its live-site cap -> that lane is stopped;
 *   - chat: turns per lane from the gate's chat book (`state/chat.jsonl`) for this run; a lane over
 *     its nightly cap, or a balance probe below the floor -> chat off: `state/chat-off.json` (the gate
 *     refuses chat slots) and `api.deepseek.com` in `state/egress/deny` (the stand's `qa-egress`
 *     proxy refuses it from then on, open tunnels included);
 *   - capacity: free memory of macOS (and of the Docker VM when the probe gives it) -> the gate's
 *     `state/capacity.json` { ok, at }; over 90 % used -> ok: false;
 *   - netfilter: the QA-EGRESS rules still in place; lost -> every lane stopped.
 * Not wired (left to the orchestrator session): the 4-minute chat turn cancel (`session.cancel`).
 *
 * Exports:
 *   DENY_HOST = 'api.deepseek.com'
 *   writeCapacity(qaHome, ok: boolean, detail?): void
 *   setChatOff(qaHome, reason: string): boolean          // false when it was already off
 *   isChatOff(qaHome): boolean
 *   createWatchdog(opts): { tick(): Promise<Tick>, start(): void, stop(): void, events: object[] }
 *     opts = { qaHome, runId, intervalMs? = 30000, caps?: { sitesPerLane? = 6, chatPerLane? = 40,
 *              memoryUsedMax? = 0.9, balanceFloor? = null },
 *              probes?: { standSites?(): string[] | null, memory?(): { usedRatio } | null,
 *                         netfilterOk?(): boolean | null, balance?(): number | null },
 *              sitePrefix? = 'qa-', fixedSites?: string[],
 *              onStopLane?(lane, reason), onStopAll?(reason), log?(event) }
 *   Tick = { capacity: boolean, chatOff: boolean, orphans: string[], stopped: string[], netfilter: boolean|null }
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { freemem, totalmem } from 'node:os'
import { join } from 'node:path'
import { openChatBook, openSiteBook } from '../gate/book.mjs'
import { readJson, stateDir, writeJsonAtomic } from './state.mjs'

export const DENY_HOST = 'api.deepseek.com'
const LANES = ['sonnet', 'sol', 'verify']

export function writeCapacity(qaHome, ok, detail = {}) {
  writeJsonAtomic(join(stateDir(qaHome), 'capacity.json'), { ok, at: Date.now(), ...detail })
}

export function isChatOff(qaHome) {
  return existsSync(join(stateDir(qaHome), 'chat-off.json'))
}

export function setChatOff(qaHome, reason) {
  const state = stateDir(qaHome)
  const denyDir = join(state, 'egress')
  mkdirSync(denyDir, { recursive: true })
  const denyFile = join(denyDir, 'deny')
  const hosts = existsSync(denyFile) ? readFileSync(denyFile, 'utf8').split(/\s+/).filter(Boolean) : []
  if (!hosts.includes(DENY_HOST)) writeFileSync(denyFile, `${[...hosts, DENY_HOST].join('\n')}\n`)
  if (isChatOff(qaHome)) return false
  writeJsonAtomic(join(state, 'chat-off.json'), { reason, at: new Date().toISOString() })
  return true
}

/**
 * macOS keeps most RAM as file cache, so `os.freemem()` alone reads "almost full" on a healthy
 * machine. On darwin count free + inactive + speculative + purgeable pages (vm_stat) as available.
 */
export function defaultMemory() {
  if (process.platform === 'darwin') {
    const r = spawnSync('/usr/bin/vm_stat', [], { encoding: 'utf8', timeout: 5000 })
    const page = Number(/page size of (\d+)/.exec(r.stdout ?? '')?.[1])
    const pages = (name) => Number(new RegExp(`${name}:\\s+(\\d+)`).exec(r.stdout ?? '')?.[1] ?? 0)
    if (page) {
      const avail =
        (pages('Pages free') +
          pages('Pages inactive') +
          pages('Pages speculative') +
          pages('Pages purgeable')) *
        page
      return { usedRatio: 1 - avail / totalmem() }
    }
  }
  return { usedRatio: 1 - freemem() / totalmem() }
}

export function createWatchdog({
  qaHome,
  runId,
  intervalMs = 30_000,
  caps = {},
  probes = {},
  sitePrefix = 'qa-',
  fixedSites = [],
  onStopLane = () => {},
  onStopAll = () => {},
  log = () => {}
}) {
  const c = { sitesPerLane: 6, chatPerLane: 40, memoryUsedMax: 0.9, balanceFloor: null, ...caps }
  const state = stateDir(qaHome)
  const fixed = new Set(fixedSites.map((s) => s.toLowerCase()))
  const stopped = new Set()
  const seenOrphans = new Set()
  const events = []
  let timer = null
  const emit = (e) => {
    events.push(e)
    log(e)
  }
  const stopLane = (lane, reason) => {
    if (stopped.has(lane)) return
    stopped.add(lane)
    emit({ t: 'stop-lane', lane, reason })
    onStopLane(lane, reason)
  }

  async function tick() {
    const out = { capacity: true, chatOff: false, orphans: [], stopped: [], netfilter: null }
    // capacity
    const mem = (probes.memory ?? defaultMemory)()
    out.capacity = !mem || !(mem.usedRatio > c.memoryUsedMax)
    writeCapacity(qaHome, out.capacity, mem ? { usedRatio: mem.usedRatio } : {})

    // sites
    const book = openSiteBook(join(state, 'sites.jsonl'))
    const known = new Set([...book.knownSiteKeys()].map((k) => String(k).toLowerCase()))
    const standSites = probes.standSites ? probes.standSites() : null
    if (standSites) {
      for (const label of standSites) {
        const l = label.toLowerCase()
        if (!l.startsWith(sitePrefix) || fixed.has(l) || known.has(l) || seenOrphans.has(l)) continue
        seenOrphans.add(l)
        book.orphan(l, runId)
        out.orphans.push(l)
      }
      if (out.orphans.length) {
        emit({ t: 'orphan', sites: out.orphans })
        for (const lane of LANES) stopLane(lane, `site outside the book: ${out.orphans.join(', ')}`)
        onStopAll('orphan site')
      }
    }
    for (const lane of LANES) {
      const n = book.liveSites(lane, runId)
      if (n > c.sitesPerLane) stopLane(lane, `over the site cap (${n})`)
    }

    // chat
    const chat = openChatBook(join(state, 'chat.jsonl'))
    for (const lane of LANES) {
      const n = chat.count({ runId, lane })
      if (n > c.chatPerLane && setChatOff(qaHome, `lane ${lane} over its chat cap (${n})`))
        emit({ t: 'chat-off', lane, turns: n })
    }
    const balance = probes.balance ? probes.balance() : null
    if (c.balanceFloor !== null && balance !== null && balance < c.balanceFloor) {
      if (setChatOff(qaHome, `balance ${balance} below the floor ${c.balanceFloor}`))
        emit({ t: 'chat-off', balance })
    }
    out.chatOff = isChatOff(qaHome)

    // netfilter
    if (probes.netfilterOk) {
      out.netfilter = probes.netfilterOk()
      if (out.netfilter === false) {
        for (const lane of LANES) stopLane(lane, 'netfilter rules lost')
        onStopAll('netfilter rules lost')
      }
    }
    out.stopped = [...stopped]
    return out
  }

  return {
    events,
    tick,
    start() {
      if (timer) return
      const run = () => tick().catch((err) => emit({ t: 'error', message: String(err?.message ?? err) }))
      run()
      timer = setInterval(run, intervalMs)
      timer.unref?.()
    },
    stop() {
      if (timer) clearInterval(timer)
      timer = null
    },
    readFlags: () => ({
      capacity: readJson(join(state, 'capacity.json'), null),
      chatOff: readJson(join(state, 'chat-off.json'), null)
    })
  }
}
