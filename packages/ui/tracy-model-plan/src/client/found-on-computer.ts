/**
 * "Found on this computer": which vendors' programs (Claude Code, Codex, Copilot CLI, …) the desktop
 * app found on this machine, so Settings › AI accounts can list those vendors first.
 *
 * Asked through the desktop bridge `window.tracyDesktop.app.agents.detect(ids)` (bridge protocol 2,
 * tasks/todo-desktop-onboard-agent.md "Preload bridge contract"). The first answer comes fast from the
 * PATH the app already has while it reads the login shell's PATH in the background
 * (`scanComplete: false`), so the page asks again every 1.5 s until the scan is complete, at most
 * three more times.
 *
 * The web has no bridge and an older app speaks protocol 1: both get nothing, and the list keeps
 * its order. A program on disk says nothing about an account: finding one only orders rows, it
 * never marks a vendor connected.
 */

/** One answer of `app.agents.detect`. */
export interface DetectionResult {
  readonly results: readonly { readonly id: string; readonly status: string }[]
  readonly scanComplete: boolean
}

/** The part of `window.tracyDesktop.app` this module reads. */
export interface DesktopApp {
  readonly protocolVersion?: number
  readonly agents?: { detect(ids: string[]): Promise<DetectionResult> }
}

/** The bridge protocol that first carries `agents`. */
const AGENTS_PROTOCOL = 2
/** How long to wait before asking again while the scan is incomplete. */
export const REPOLL_MS = 1500
/** How many times to ask again after the first answer. */
export const MAX_REPOLLS = 3

/** The desktop app's bridge on `win`, or undefined (a browser, or a page outside the app). */
export function desktopApp(win: unknown): DesktopApp | undefined {
  const app = (win as { tracyDesktop?: { app?: unknown } } | undefined)?.tracyDesktop?.app
  return app !== null && typeof app === 'object' ? (app as DesktopApp) : undefined
}

/** The asked ids an answer reports `found`, in the asked order; null for a malformed answer. */
function foundIn(answer: unknown, ids: readonly string[]): string[] | null {
  const results = (answer as DetectionResult | null)?.results
  if (!Array.isArray(results)) return null
  const found = new Set(
    results.filter((r) => r !== null && typeof r === 'object' && r.status === 'found').map((r) => r.id)
  )
  return ids.filter((id) => found.has(id))
}

/**
 * The vendors among `ids` whose program the desktop app found on this computer. Never throws: no
 * bridge, an older bridge, an error or a malformed answer give what was found so far (often []).
 * @param options.app - the bridge (`desktopApp(window)`); undefined on the web.
 * @param options.sleep - waits `ms` between polls (injectable for tests).
 * @param options.onFound - called with the found list after each answer that changed it.
 * @param options.signal - stops asking once aborted (the section unmounted).
 */
export async function foundOnComputer(
  ids: readonly string[],
  options: {
    app: DesktopApp | undefined
    sleep?: (ms: number) => Promise<void>
    onFound?: (found: string[]) => void
    signal?: AbortSignal
  }
): Promise<string[]> {
  const { app, signal } = options
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((done) => setTimeout(done, ms)))
  if (
    ids.length === 0 ||
    !app ||
    typeof app.protocolVersion !== 'number' ||
    app.protocolVersion < AGENTS_PROTOCOL
  )
    return []
  if (typeof app.agents?.detect !== 'function') return []
  let found: string[] = []
  for (let poll = 0; poll <= MAX_REPOLLS; poll++) {
    if (poll > 0) await sleep(REPOLL_MS)
    if (signal?.aborted) break
    let answer: unknown
    try {
      answer = await app.agents.detect([...ids])
    } catch {
      break
    }
    const now = foundIn(answer, ids)
    if (now === null) break
    if (now.join('\n') !== found.join('\n')) {
      found = now
      if (!signal?.aborted) options.onFound?.(found)
    }
    if ((answer as DetectionResult).scanComplete === true) break
  }
  return found
}

/** `providers` with the found ones first, each group keeping its order; the same array when none. */
export function foundFirst<T extends { readonly id: string }>(
  providers: readonly T[],
  found: readonly string[]
): readonly T[] {
  if (found.length === 0) return providers
  const seen = new Set(found)
  return [...providers.filter((p) => seen.has(p.id)), ...providers.filter((p) => !seen.has(p.id))]
}
