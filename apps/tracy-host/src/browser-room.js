/**
 * How much browser work this host runs at once: demo QA runs and vision capture streams (`browserRunsOf`), and the
 * tabs one QA run reads pages in (`demoQaTabsOf`).
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

/** QA runs and capture streams at once: `TRACY_BROWSER_RUNS`, else one per 8 GB, between 1 and 3. */
export function browserRunsOf(env, memory = hostMemoryBytes()) {
  const n = Number(env.TRACY_BROWSER_RUNS)
  if (Number.isInteger(n) && n > 0) return n
  return Math.max(1, Math.min(3, Math.floor(memory / (8 * GB))))
}

/** Pages one QA run reads at once after home: `TRACY_DEMO_QA_TABS`, else 3 from 16 GB, 1 below. */
export function demoQaTabsOf(env, memory = hostMemoryBytes()) {
  const n = Number(env.TRACY_DEMO_QA_TABS)
  if (Number.isInteger(n) && n > 0) return n
  return memory >= 16 * GB ? 3 : 1
}
