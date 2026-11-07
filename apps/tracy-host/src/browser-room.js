/**
 * How much browser work this host runs at once: demo QA runs (`browserRunsOf`), vision capture streams
 * (`visionStreamsOf`), and the tabs one QA run reads pages in (`demoQaTabsOf`).
 *
 * 🔒 WHY (28/10/2026). One QA run and one capture stream per host, with one tab, is what the 7.6 GB Docker VM of a
 * Mac stand holds beside its sites. On a server every build's check queued behind every other build's, and a check
 * that waited past its deadline answered DEMO_QA_DEADLINE without having read a page. A host with the memory for it
 * now runs more; a small host keeps one of each. A setting overrides either.
 */
import { totalmem } from 'node:os'

const GB = 1024 ** 3

/** The memory this process may use: its container's limit when it has one, else the machine's. */
export function hostMemoryBytes() {
  const limit = typeof process.constrainedMemory === 'function' ? Number(process.constrainedMemory()) : 0
  const total = totalmem()
  return limit > 0 && limit < total ? limit : total
}

/** QA runs at once: `TRACY_BROWSER_RUNS`, else one per 8 GB, between 1 and 3. */
export function browserRunsOf(env, memory = hostMemoryBytes()) {
  const n = Number(env.TRACY_BROWSER_RUNS)
  if (Number.isInteger(n) && n > 0) return n
  return Math.max(1, Math.min(3, Math.floor(memory / (8 * GB))))
}

/**
 * Vision capture streams at once (one page, both widths, per stream): `TRACY_VISION_STREAMS`, else one per 2 GB,
 * between 1 and 4. 🔒 WHY (07/11/2026). The streams used to share `browserRunsOf`, so a host with 8.3 GB ran one
 * stream; step 9b's finder asks for four pages at once and every page waited for the one before (10 pages at two
 * widths took about three minutes). 🔒 MEMORY CAP: a stream holds one browser context with one page and one
 * bounded response queue (`VISION_FRAME_BYTES`), about 300 MB for a heavy CMS page, so four streams stay near
 * 1.2 GB on the one shared browser. The cap of 4 matches the finder's `SHOTS_AT_ONCE`; past it requests queue.
 */
export function visionStreamsOf(env, memory = hostMemoryBytes()) {
  const n = Number(env.TRACY_VISION_STREAMS)
  if (Number.isInteger(n) && n > 0) return n
  return Math.max(1, Math.min(4, Math.floor(memory / (2 * GB))))
}

/** Pages one QA run reads at once after home: `TRACY_DEMO_QA_TABS`, else 3 from 16 GB, 1 below. */
export function demoQaTabsOf(env, memory = hostMemoryBytes()) {
  const n = Number(env.TRACY_DEMO_QA_TABS)
  if (Number.isInteger(n) && n > 0) return n
  return memory >= 16 * GB ? 3 : 1
}

/**
 * The bytes the incremental QA's read cache may hold (`DemoReadCache`, counted four times a read's JSON):
 * `TRACY_DEMO_QA_CACHE_MB`, else a 32nd of the memory, between 64 and 512 MB. 🔒 A read is ~0.7 MB of JSON (a Joomla
 * page with its sheets' rules), so the 16 MB the cache had held about five pages, and reading a 29-page site in order
 * pushed out every page before its next read (local measure 28/10/2026: "0 with a last read" on every run).
 */
export function demoReadCacheBytesOf(env, memory = hostMemoryBytes()) {
  const mb = Number(env.TRACY_DEMO_QA_CACHE_MB)
  if (Number.isInteger(mb) && mb > 0) return mb * 1024 * 1024
  return Math.max(64 * 1024 * 1024, Math.min(512 * 1024 * 1024, Math.floor(memory / 32)))
}
