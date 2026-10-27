/**
 * A sign-in by a code the person types on the vendor's page (GitHub's device flow, and OpenAI's for
 * ChatGPT Codex on the web), as tracy-web's
 * broker runs it (`apps/tracy-web/src/seat-plan/broker.js` `start` / `complete`):
 *
 *   POST /api/seat-plan/connect/start    {provider, surface} → {signIn: 'device', attemptId, state,
 *                                                               authorizeUrl, userCode, intervalMs}
 *   POST /api/seat-plan/connect/complete {attemptId, state}  → {pending: true, intervalMs?} until the
 *                                                               vendor confirms, then the status
 *
 * The attempt lives ten minutes on the server (`expires_at`), so the section stops asking then too.
 */
import { signInOf } from './plan-doors.ts'

/** How long a sign-in may wait for the person, as the broker keeps the attempt. */
export const DEVICE_LIMIT_MS = 10 * 60 * 1000
/** The shortest pause between two polls, whatever the vendor asks for. */
export const MIN_INTERVAL_MS = 2000

/** The first wait after tracy-web did not answer a poll; it doubles per failure in a row. */
export const RETRY_FIRST_MS = 5000
/** The longest wait between two polls while tracy-web does not answer. */
export const RETRY_MAX_MS = 30_000

/** A device sign-in under way, as the section shows it. */
export interface DeviceAttempt {
  readonly provider: string
  readonly attemptId: string
  readonly state: string
  readonly userCode: string
  readonly authorizeUrl: string
  readonly intervalMs: number
}

/** The sign-in was not finished within {@link DEVICE_LIMIT_MS}. */
export class DeviceTimeout extends Error {
  constructor() {
    super('model-plan:device-timeout')
  }
}

/**
 * Why a call got no answer from tracy-web itself: the network failed (`network`), or something in
 * front of it answered instead (`unavailable`: a 502/503/504, or an HTML error page while the web
 * container restarts for a deploy). The attempt may still be fine on the server, so a device poll
 * tries again; a one-shot call says "try again". No words here: the panel maps it to its strings.
 */
export class TransientError extends Error {
  readonly transient = true
  constructor(readonly code: 'network' | 'unavailable') {
    super(`model-plan:transient:${code}`)
    this.name = 'TransientError'
  }
}

/** Whether `error` is a {@link TransientError} (also across two bundled copies of this file). */
export function isTransient(error: unknown): error is TransientError {
  return (error as { transient?: unknown } | null)?.transient === true
}

/**
 * How a started sign-in continues: the broker's own `signIn`, and only when an older tracy-web sends
 * none, the vendor table of `plan-doors.ts`.
 * @param provider - the vendor id.
 * @param answer - what `connect/start` answered.
 */
export function signInKind(provider: string, answer: { signIn?: unknown }): 'device' | 'browser' {
  if (answer.signIn === 'device' || answer.signIn === 'browser') return answer.signIn
  return signInOf(provider) === 'device' ? 'device' : 'browser'
}

/**
 * The device attempt in a `connect/start` answer, or undefined for a browser sign-in.
 * @param provider - the vendor id.
 * @param answer - what `connect/start` answered.
 */
export function deviceAttemptOf(
  provider: string,
  answer: Record<string, unknown>
): DeviceAttempt | undefined {
  if (signInKind(provider, answer) !== 'device') return undefined
  return {
    provider,
    attemptId: String(answer.attemptId ?? ''),
    state: String(answer.state ?? ''),
    userCode: String(answer.userCode ?? ''),
    authorizeUrl: String(answer.authorizeUrl ?? ''),
    intervalMs: typeof answer.intervalMs === 'number' ? answer.intervalMs : 0
  }
}

/** How {@link waitForDevice} waits and tells the time; a test hands in its own. */
export interface DeviceClock {
  readonly sleep?: (ms: number) => Promise<void>
  readonly now?: () => number
}

/** What {@link waitForDevice} says while it waits. */
export interface DeviceWatch {
  /**
   * `true` after each poll tracy-web did not answer ({@link TransientError}); `false` once, at the
   * next answer after such failures.
   */
  readonly onTransient?: (failing: boolean) => void
}

/** Wait `ms`, or reject the moment `signal` aborts. */
function pause(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason)
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', stop)
      resolve()
    }, ms)
    const stop = () => {
      clearTimeout(timer)
      reject(signal.reason)
    }
    signal.addEventListener('abort', stop, { once: true })
  })
}

/**
 * Poll until the vendor confirms. A poll tracy-web did not answer ({@link TransientError}: a restart
 * for a deploy, the network) does not end the attempt, which still lives on the server: the next
 * poll waits {@link RETRY_FIRST_MS}, doubled per failure in a row up to {@link RETRY_MAX_MS}.
 * @param attempt - from {@link deviceAttemptOf}.
 * @param complete - one `connect/complete` call with `{attemptId, state}`.
 * @param signal - aborts the wait (Cancel, the section closing); the promise then rejects with its reason.
 * @param clock - the pause and the time, for a test; the real clock by default. `onTransient` hears
 *   of the failures.
 * @returns the answer that is no longer pending: the account status.
 * @throws {DeviceTimeout} when the person did not finish within {@link DEVICE_LIMIT_MS}.
 */
export async function waitForDevice<T>(
  attempt: DeviceAttempt,
  complete: (body: { attemptId: string; state: string }) => Promise<T>,
  signal: AbortSignal,
  clock: DeviceClock & DeviceWatch = {}
): Promise<T> {
  const now = clock.now ?? (() => Date.now())
  const sleep = clock.sleep ?? ((ms: number) => pause(ms, signal))
  const startedAt = now()
  let interval = attempt.intervalMs
  let failures = 0
  for (;;) {
    const wait =
      failures === 0
        ? Math.max(interval, MIN_INTERVAL_MS)
        : Math.min(RETRY_MAX_MS, Math.max(interval, RETRY_FIRST_MS) * 2 ** (failures - 1))
    await sleep(wait)
    if (signal.aborted) throw signal.reason
    if (now() - startedAt >= DEVICE_LIMIT_MS) throw new DeviceTimeout()
    let answer: T
    try {
      answer = await complete({ attemptId: attempt.attemptId, state: attempt.state })
    } catch (error) {
      if (signal.aborted) throw signal.reason
      if (!isTransient(error)) throw error
      failures += 1
      clock.onTransient?.(true)
      continue
    }
    if (signal.aborted) throw signal.reason
    if (failures > 0) {
      failures = 0
      clock.onTransient?.(false)
    }
    const pending = answer as { pending?: unknown; intervalMs?: unknown } | null
    if (pending?.pending !== true) return answer
    if (typeof pending.intervalMs === 'number') interval = pending.intervalMs
  }
}

/**
 * Where the person signs in from: `desktop` when the page runs in the desktop app
 * (`window.tracyDesktop`, which catches a vendor's localhost callback itself), else `web`. Sent with
 * `connect/start`; the broker picks the sign-in from it (ChatGPT Codex: a device code on the web).
 */
export function signInSurface(): 'web' | 'desktop' {
  if (typeof window === 'undefined') return 'web'
  return (window as { tracyDesktop?: unknown }).tracyDesktop ? 'desktop' : 'web'
}

/** The desktop app's way to open a page in the person's browser, when the page runs in the app. */
function desktopOpener(): ((url: string) => void) | undefined {
  if (typeof window === 'undefined') return undefined
  const links = (window as { tracyDesktop?: { links?: { openExternal?: unknown } } }).tracyDesktop?.links
  return typeof links?.openExternal === 'function' ? (links.openExternal as (url: string) => void) : undefined
}

/**
 * Whether the page runs in the desktop app, where a link must go through {@link openExternal}: an
 * `<a target="_blank">` would open inside the app, not in the person's browser. On the web a link
 * follows its own `href` (a new tab).
 */
export function opensThroughApp(): boolean {
  return desktopOpener() !== undefined
}

/**
 * Open the vendor's page in the person's browser: through the desktop app's links when the page runs
 * in it (`window.tracyDesktop.links.openExternal`), else in a new TAB by clicking a throwaway
 * `<a target="_blank" rel="noopener noreferrer">`. Not `window.open(url, '_blank', 'noopener')`:
 * Chrome opens that as a popup window with no address bar, and a browser sign-in ends on a localhost
 * address the person copies from that bar (Claude, 12/10/2026). Call it inside the person's click,
 * so a popup blocker lets it through; the new page gets no `opener` either way.
 */
export function openExternal(url: string): void {
  const viaApp = desktopOpener()
  if (viaApp) {
    viaApp(url)
    return
  }
  const link = document.createElement('a')
  link.href = url
  link.target = '_blank'
  link.rel = 'noopener noreferrer'
  link.style.display = 'none'
  document.body.append(link)
  try {
    link.click()
  } finally {
    link.remove()
  }
}

/**
 * Put `text` on the clipboard. `navigator.clipboard` exists only in a secure context, so a page on
 * plain http (a local stand) has none; there, and when it refuses, the text is selected in a hidden
 * textarea and copied with the copy command.
 * @returns whether a copy went through.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    /* refused: try the copy command */
  }
  const area = document.createElement('textarea')
  area.value = text
  area.setAttribute('readonly', '')
  area.style.position = 'fixed'
  area.style.opacity = '0'
  document.body.append(area)
  const before = document.activeElement as HTMLElement | null
  area.focus()
  area.select()
  try {
    return document.execCommand('copy')
  } catch {
    return false
  } finally {
    area.remove()
    before?.focus?.()
  }
}
