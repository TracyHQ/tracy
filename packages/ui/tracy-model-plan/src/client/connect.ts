/**
 * Connecting one vendor's AI account, from `connect/start` to a connected status, with no React:
 * Settings › AI accounts (`AccountsPane.tsx`) and the desktop first-run screen
 * (`@tracy/dsh-onboard`, step "Pick your AI account") both drive it. Exported as
 * `@tracy/dsh-model-plan/connect` (source, bundled by whoever imports it).
 *
 * tracy-web's broker (`apps/tracy-web/src/seat-plan/broker.js`) answers `connect/start` with one of
 * two sign-ins, chosen per vendor and per surface (`surface`: `desktop` in the desktop app, else
 * `web`; ChatGPT Codex signs in by a device code on the web and through the browser on the desktop):
 *   - **browser**: the vendor's page; the person signs in there and the callback URL comes back,
 *     either caught by the desktop app (the `tracy-subscription-callback` window event, matched by
 *     `state`) or pasted by hand (`submit`). `connect/complete {attemptId, url}` answers the status.
 *   - **device**: a code the person types on the vendor's page; `connect/complete {attemptId, state}`
 *     is polled until the vendor confirms (`device-sign-in.ts`).
 *
 * Every change is reported through `onState`; after `cancel()` nothing more is.
 */
import { accountStatus } from './account-status.ts'
import {
  type DeviceAttempt,
  type DeviceClock,
  DeviceTimeout,
  deviceAttemptOf,
  isTransient,
  TransientError,
  signInSurface,
  waitForDevice
} from './device-sign-in.ts'

export { copyText, type DeviceAttempt, isTransient, TransientError } from './device-sign-in.ts'

/**
 * Hand a status answer (a connect just now) to the page's one copy of it (`account-status.ts`), so
 * the account menu's AI-accounts row follows without a reload, as Settings › AI accounts does.
 */
export function publishStatus(status: SeatPlanStatus): void {
  accountStatus.publish(status)
}

/** The page's copy, for a test. */
export const pageAccountStatus = () => accountStatus

/** One connected (or once connected) account, as `GET /api/seat-plan/status` lists it. */
export interface SeatPlanConnection {
  readonly connectionId: string
  readonly provider: string
  readonly name: string
  readonly account: string
  readonly connected: boolean
}

/** `GET /api/seat-plan/status`, and what every write door answers. */
export interface SeatPlanStatus {
  readonly next: { connectionId: string; name: string } | null
  readonly enabled: boolean
  /**
   * The vendors one can connect. `signIn` (`browser`, `device`, `key`) is how each signs in; a
   * tracy-web older than 11/10/2026 sends none (`plan-doors.ts` `signInFor`).
   */
  readonly providers: readonly { id: string; name: string; signIn?: unknown; webSignIn?: unknown }[]
  readonly connections: readonly SeatPlanConnection[]
  /**
   * The configured order: connection ids and the literal `tracy` (Tracy AI, an entry like any
   * other) exactly once. `enabled` stays true; the page sends it back as such.
   */
  readonly routing: {
    enabled: boolean
    connectionOrder: string[]
    version: number
  }
}

/** One call to a `/api/seat-plan/<door>`; a refusal rejects with the server's message. */
export type SeatPlanCall = (door: string, method?: string, body?: unknown) => Promise<any>

/**
 * The slice of `fetch` the doors use. `text`, `status` and `headers` are what a real response has;
 * a test that answers with `json` alone still works.
 */
type Fetch = (
  url: string,
  init?: RequestInit
) => Promise<Pick<Response, 'ok' | 'json'> & Partial<Pick<Response, 'status' | 'text' | 'headers'>>>

/** Statuses a proxy answers while tracy-web is down or restarting. */
const GATEWAY = new Set([502, 503, 504])

/** The body as JSON, or `undefined` when it is not JSON (a proxy's HTML page). */
async function bodyOf(response: Awaited<ReturnType<Fetch>>): Promise<{ json: boolean; data: any }> {
  if (typeof response.text !== 'function') {
    try {
      return { json: true, data: await response.json() }
    } catch {
      return { json: false, data: undefined }
    }
  }
  const text = await response.text()
  try {
    return { json: true, data: JSON.parse(text) }
  } catch {
    return { json: false, data: undefined }
  }
}

/**
 * The seat-plan doors over `fetch`: JSON in and out, the page's own cookie. A failed network, a
 * gateway status (502/503/504) or a body that is not JSON rejects with a {@link TransientError},
 * never a parse error; any other refusal rejects with the server's message.
 * @param fetchFn - the page's fetch by default.
 */
export function seatPlanApi(fetchFn: Fetch = (url, init) => fetch(url, init)): SeatPlanCall {
  return async (door, method = 'GET', body) => {
    let response: Awaited<ReturnType<Fetch>>
    try {
      response = await fetchFn(`/api/seat-plan/${door}`, {
        method,
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) })
      })
    } catch (error) {
      if ((error as { name?: unknown } | null)?.name === 'AbortError') throw error
      throw new TransientError('network')
    }
    if (response.status !== undefined && GATEWAY.has(response.status)) throw new TransientError('unavailable')
    const { json, data } = await bodyOf(response)
    if (!json) throw new TransientError('unavailable')
    if (!response.ok) throw new Error(data?.message)
    return data
  }
}

/** Where one vendor's sign-in stands. */
export type ConnectState =
  | { readonly kind: 'starting'; readonly provider: string }
  /**
   * A code to type on the vendor's page (`attempt.userCode`, `attempt.authorizeUrl`); polling.
   * `retrying`: the last polls got no answer from tracy-web (a restart, the network) and the poll
   * keeps asking; absent again at the next answer.
   */
  | {
      readonly kind: 'device'
      readonly provider: string
      readonly attempt: DeviceAttempt
      readonly retrying?: true
    }
  /** The vendor's page is (or can be) open; waiting for the callback URL. */
  | {
      readonly kind: 'browser'
      readonly provider: string
      readonly attemptId: string
      readonly authorizeUrl: string
      readonly state: string
    }
  /** The callback URL went to the server. */
  | { readonly kind: 'completing'; readonly provider: string }
  | { readonly kind: 'connected'; readonly provider: string; readonly status: SeatPlanStatus }
  /**
   * The attempt ended. `timeout`: nobody finished within ten minutes. `refused`: the server said no
   * (`message` is its words, possibly empty). `transient`: tracy-web did not answer a one-shot call
   * (a restart, the network; `message` is empty): trying again may work.
   */
  | {
      readonly kind: 'failed'
      readonly provider: string
      readonly reason: 'timeout' | 'refused' | 'transient'
      readonly message: string
    }

/** A sign-in under way. */
export interface Connecting {
  readonly provider: string
  /** Finish a browser sign-in with the callback URL the person pasted. Ignored otherwise. */
  submit(url: string): void
  /** Stop: no more requests, no more `onState`. */
  cancel(): void
}

export interface ConnectDeps extends DeviceClock {
  readonly call: SeatPlanCall
  readonly onState: (state: ConnectState) => void
  /** Open a browser sign-in's page (a device page opens only when the person asks). */
  readonly openBrowser?: (url: string) => void
  /** Where the desktop app announces a caught callback (`window`); none = paste only. */
  readonly events?: EventTarget
}

/** The callback event the desktop app dispatches on `window` (`detail.url`). */
export const CALLBACK_EVENT = 'tracy-subscription-callback'

const messageOf = (error: unknown): string => (error instanceof Error && error.message ? error.message : '')

/**
 * Start connecting `provider`.
 * @param provider - the vendor id, as `status.providers` lists it.
 */
export function startConnect(provider: string, deps: ConnectDeps): Connecting {
  const stop = new AbortController()
  let browser: { attemptId: string; state: string } | null = null
  let submitted = false
  const report = (state: ConnectState) => {
    if (!stop.signal.aborted) deps.onState(state)
  }
  const fail = (error: unknown) =>
    report({
      kind: 'failed',
      provider,
      reason: error instanceof DeviceTimeout ? 'timeout' : isTransient(error) ? 'transient' : 'refused',
      message: isTransient(error) ? '' : messageOf(error)
    })
  const finish = () => {
    stop.abort()
    deps.events?.removeEventListener(CALLBACK_EVENT, onCallback)
  }

  const submit = (url: string) => {
    if (browser === null || submitted || stop.signal.aborted) return
    submitted = true
    const attempt = browser
    report({ kind: 'completing', provider })
    deps.call('connect/complete', 'POST', { attemptId: attempt.attemptId, url }).then(
      (status: SeatPlanStatus) => {
        report({ kind: 'connected', provider, status })
        finish()
      },
      (error) => {
        fail(error)
        finish()
      }
    )
  }

  function onCallback(event: Event) {
    const url = (event as CustomEvent<{ url?: unknown }>).detail?.url
    if (browser === null || typeof url !== 'string') return
    try {
      if (new URL(url).searchParams.get('state') !== browser.state) return
    } catch {
      return
    }
    submit(url)
  }

  report({ kind: 'starting', provider })
  deps.call('connect/start', 'POST', { provider, surface: signInSurface() }).then(
    (answer: Record<string, unknown>) => {
      if (stop.signal.aborted) return
      const device = deviceAttemptOf(provider, answer)
      if (device) {
        report({ kind: 'device', provider, attempt: device })
        const onTransient = (failing: boolean) =>
          report({
            kind: 'device',
            provider,
            attempt: device,
            ...(failing ? { retrying: true as const } : {})
          })
        waitForDevice(device, (body) => deps.call('connect/complete', 'POST', body), stop.signal, {
          sleep: deps.sleep,
          now: deps.now,
          onTransient
        }).then(
          (status: SeatPlanStatus) => {
            report({ kind: 'connected', provider, status })
            finish()
          },
          (error) => {
            fail(error)
            finish()
          }
        )
        return
      }
      browser = { attemptId: String(answer.attemptId ?? ''), state: String(answer.state ?? '') }
      const authorizeUrl = String(answer.authorizeUrl ?? '')
      deps.events?.addEventListener(CALLBACK_EVENT, onCallback)
      report({ kind: 'browser', provider, ...browser, authorizeUrl })
      deps.openBrowser?.(authorizeUrl)
    },
    (error) => {
      fail(error)
      finish()
    }
  )

  return { provider, submit, cancel: finish }
}
