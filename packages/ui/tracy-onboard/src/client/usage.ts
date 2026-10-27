/**
 * Usage of the first-run guides: which step a showing of the Welcome popup or a tour reached, and how
 * it ended, told to tracy-web's `POST /api/onboarding/step` (`apps/tracy-web/src/onboarding/usage.js`
 * holds the closed lists of flows, steps and ends). Each showing draws its own id, so the steps of one
 * showing read as one walk. Never awaited and never surfaced: a refusal or a lost answer only means one
 * step goes uncounted, and nothing here may slow the guide down.
 */

/** The door, and the flows it knows. */
export const ONBOARD_STEP_DOOR = '/api/onboarding/step'
export type OnboardFlow = 'welcome' | 'tour-start' | 'tour-site'
/** How a showing of the Welcome popup ends (`WelcomeExit`), and how a tour stage ends (`finish`). */
export const WELCOME_ENDS = ['close', 'escape', 'cta'] as const
export const TOUR_ENDS = ['done', 'skip', 'escape', 'gone'] as const
export type OnboardEnd = (typeof WELCOME_ENDS)[number] | (typeof TOUR_ENDS)[number]

type Fetch = (url: string, init?: RequestInit) => Promise<Response>

/** A fresh id for one showing; a browser with no `crypto.randomUUID` builds the same shape by hand. */
export function newRunId(): string {
  const native = globalThis.crypto?.randomUUID?.()
  if (native) return native
  const hex = (n: number) =>
    Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join('')
  return `${hex(8)}-${hex(4)}-4${hex(3)}-${'89ab'[Math.floor(Math.random() * 4)]}${hex(3)}-${hex(12)}`
}

function send(fetchFn: Fetch, body: Record<string, string>): void {
  try {
    void fetchFn(ONBOARD_STEP_DOOR, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      keepalive: true
    }).catch(() => {})
  } catch {
    /* A fetch that throws at once is one step uncounted, nothing more. */
  }
}

/** A step this showing reached. */
export function onboardStep(
  runId: string,
  flow: OnboardFlow,
  step: string,
  fetchFn: Fetch = (url, init) => fetch(url, init)
): void {
  send(fetchFn, { runId, flow, step })
}

/** How this showing ended, and at which step. `keepalive` carries it past a navigation that follows. */
export function onboardEnd(
  runId: string,
  flow: OnboardFlow,
  step: string,
  end: OnboardEnd,
  fetchFn: Fetch = (url, init) => fetch(url, init)
): void {
  send(fetchFn, { runId, flow, step, end })
}
