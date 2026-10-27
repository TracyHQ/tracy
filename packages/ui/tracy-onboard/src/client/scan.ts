/**
 * The scan of this computer for the vendors' programs (Claude Code, Codex, Copilot CLI, …), through
 * `app.agents.detect(ids)`. The first answer comes fast from the PATH the app already has while the
 * app reads the login shell's PATH in the background (`scanComplete: false`), so the screen asks
 * again every 1.5 s until the scan is complete, for at most `SCAN_CAP_MS`. The cap lies past the
 * app's own 10 s limit on that read (tracy-desktop `src/shell-path.js`): asking for less gave up on
 * a slow login shell while the app was still reading it (packaged 0.6.0-dev.1, 11/10/2026). A read
 * that failed never completes; the caller then stops showing "Looking…" (flow `scanStopped`).
 *
 * Adapted from `@tracy/dsh-model-plan` `src/client/found-on-computer.ts` (same interval): that
 * package publishes only its built bundle, so the loop is copied, and this copy keeps every status
 * and `scanComplete` because step 1 must tell "not found" from "not known yet".
 *
 * A program on disk says nothing about an account: finding one only orders the cards.
 */
import type { OnboardApp } from './bridge.ts'
import type { Detection } from './flow.ts'

/** How long to wait before asking again while the scan is incomplete. */
export const REPOLL_MS = 1500
/** How long to keep asking while the scan is incomplete: past the app's 10 s login-shell limit. */
export const SCAN_CAP_MS = 12_000
/** How many times to ask again after the first answer. */
export const MAX_REPOLLS = Math.ceil(SCAN_CAP_MS / REPOLL_MS)

const isDetection = (value: unknown): value is Detection =>
  value !== null &&
  typeof value === 'object' &&
  Array.isArray((value as Detection).results) &&
  typeof (value as Detection).scanComplete === 'boolean'

/**
 * Ask the app which of `ids` are on this computer. Never throws.
 * @param app - the bridge.
 * @param ids - vendor ids, in the order the screen lists them.
 * @param options.refresh - start with `agents.refresh` (the person pressed Refresh after installing).
 * @param options.onAnswer - called with each good answer.
 * @param options.sleep - waits `ms` between asks (injectable for tests).
 * @param options.signal - stops asking once aborted (the screen closed).
 * @returns the last good answer (still incomplete when the cap ran out), or null when the first ask
 *   failed or there was nothing to ask.
 */
export async function scanAgents(
  app: Pick<OnboardApp, 'agents'>,
  ids: readonly string[],
  options: {
    refresh?: boolean
    onAnswer?: (detection: Detection) => void
    sleep?: (ms: number) => Promise<void>
    signal?: AbortSignal
  } = {}
): Promise<Detection | null> {
  const { signal } = options
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((done) => setTimeout(done, ms)))
  if (ids.length === 0) return null
  let last: Detection | null = null
  for (let ask = 0; ask <= MAX_REPOLLS; ask++) {
    if (ask > 0) await sleep(REPOLL_MS)
    if (signal?.aborted) break
    let answer: unknown
    try {
      answer = await (ask === 0 && options.refresh
        ? app.agents.refresh([...ids])
        : app.agents.detect([...ids]))
    } catch {
      break
    }
    if (!isDetection(answer)) break
    last = answer
    if (!signal?.aborted) options.onAnswer?.(answer)
    if (answer.scanComplete) break
  }
  return last
}
