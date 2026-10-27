/**
 * The first-run flow as a pure state machine: which of the steps shows, which AI account the
 * person picked, what the scan of this computer answered, and how the flow closed. The screen
 * (`Onboard.tsx`) only projects this state and dispatches actions; nothing here touches React, the
 * bridge or the network, so every rule below is tested without them (test/flow.test.mjs).
 *
 * Plan: tasks/todo-desktop-onboard-v2.md §C. Visual truth:
 * tasks/evidence/desktop-onboard/mock/onboard-connect-now.html.
 */

/**
 * Steps: 0 Sign in · 1 AI account · 2 Appearance & language · 3 Notifications. The desktop app has
 * all four; the web stops after Appearance & language (no agent-finished notification on the web
 * yet, tasks/todo-web-onboard.md), so its flow is built with `steps: 3`.
 */
export const STEP_COUNT = 4

/**
 * Where the screen opens before it knows anything: the AI account. Signing in is behind the person
 * (this screen draws only after sign-in); once the data arrived, `startAt` moves to the first step
 * not done.
 */
export const OPENING_STEP = 1

/** How many vendors "Popular" shows when nothing was found (the mock's six). */
export const POPULAR_COUNT = 6

/** One vendor the deployment offers, from `GET /api/desktop/config` `catalogue`. */
export interface Vendor {
  readonly id: string
  readonly name: string
  /** Where "Install instructions" goes; null when the deployment names none. */
  readonly homepage: string | null
}

/** One answer of `window.tracyDesktop.app.agents.detect` (bridge protocol 2). */
export interface Detection {
  readonly results: readonly { readonly id: string; readonly status: string }[]
  readonly scanComplete: boolean
}

/** How the flow ended, as `onboarding.close` takes it. */
export interface Closed {
  readonly outcome: 'completed' | 'dismissed'
  readonly picked: string | null
}

/**
 * What the scan knows: nothing yet, an answer, an incomplete answer the screen stopped waiting on
 * (the app could not finish reading the login shell before the cap), or a failure (no answer will
 * come); `none` = this surface cannot look at the computer at all (the web), so nothing is ever
 * claimed about it.
 */
export type Scan =
  | { readonly kind: 'none' }
  | { readonly kind: 'waiting' }
  | { readonly kind: 'answered'; readonly detection: Detection }
  | { readonly kind: 'stopped'; readonly detection: Detection }
  | { readonly kind: 'failed' }

export interface FlowState {
  /** How many steps this surface has (`STEP_COUNT` on the desktop app, 3 on the web). */
  readonly steps: number
  readonly step: number
  readonly picked: string | null
  /** The person picked by hand: a later scan answer never overrides it. */
  readonly pickedByHand: boolean
  /** "Show N more" opened. */
  readonly expanded: boolean
  readonly scan: Scan
  /** The person moved between steps (Continue, Back, the checklist): `startAt` no longer applies. */
  readonly moved: boolean
  readonly closed: Closed | null
}

export type FlowAction =
  | { readonly type: 'next' }
  /** Close as completed from any step (an API-key vendor hands over to Settings › AI accounts). */
  | { readonly type: 'finish' }
  | { readonly type: 'back' }
  | { readonly type: 'jump'; readonly step: number }
  /** Where a reopened panel starts (the first step not done), once the data to judge it arrived. */
  | { readonly type: 'startAt'; readonly step: number }
  | { readonly type: 'pick'; readonly id: string }
  | { readonly type: 'toggleMore' }
  | { readonly type: 'detected'; readonly detection: Detection }
  /** The vendors with an AI account connected, the one in use first (the status door). */
  | { readonly type: 'connected'; readonly ids: readonly string[] }
  | { readonly type: 'detectFailed' }
  /** The scan stopped asking while incomplete: stop "Looking…", keep what was found so far. */
  | { readonly type: 'scanStopped' }
  | { readonly type: 'rescan' }
  | { readonly type: 'dismiss' }

/**
 * @param options.steps - how many steps this surface has (default: all four).
 * @param options.scan - whether this surface scans the computer (default: yes; the web cannot).
 */
export function initialState(options: { steps?: number; scan?: boolean } = {}): FlowState {
  return {
    steps: options.steps ?? STEP_COUNT,
    step: OPENING_STEP,
    picked: null,
    pickedByHand: false,
    expanded: false,
    scan: options.scan === false ? { kind: 'none' } : { kind: 'waiting' },
    moved: false,
    closed: null
  }
}

/** The ids an answer reports `found`. */
function foundIds(detection: Detection): Set<string> {
  return new Set(detection.results.filter((r) => r.status === 'found').map((r) => r.id))
}

/**
 * The next state. A closed flow ignores everything.
 * @param state - the current state.
 * @param action - what happened.
 */
export function reduce(state: FlowState, action: FlowAction): FlowState {
  if (state.closed !== null) return state
  switch (action.type) {
    case 'next':
      return state.step < state.steps - 1
        ? { ...state, step: state.step + 1, moved: true }
        : { ...state, closed: { outcome: 'completed', picked: state.picked } }
    case 'finish':
      return { ...state, closed: { outcome: 'completed', picked: state.picked } }
    case 'back':
      return state.step > 0 ? { ...state, step: state.step - 1, moved: true } : state
    case 'jump':
      return Number.isInteger(action.step) && action.step >= 0 && action.step < state.steps
        ? { ...state, step: action.step, moved: true }
        : state
    case 'startAt':
      return !state.moved && Number.isInteger(action.step) && action.step >= 0 && action.step < state.steps
        ? { ...state, step: action.step }
        : state
    case 'pick':
      return { ...state, picked: action.id, pickedByHand: true }
    case 'toggleMore':
      return { ...state, expanded: !state.expanded }
    case 'detected': {
      // The first answer that finds programs picks the first of them. The page asks in catalogue
      // order and the bridge answers one result per asked id in that order, so "first" is the
      // first the person sees.
      const next: FlowState = { ...state, scan: { kind: 'answered', detection: action.detection } }
      if (state.pickedByHand || state.picked !== null) return next
      const first = action.detection.results.find((r) => r.status === 'found')?.id ?? null
      return first === null ? next : { ...next, picked: first }
    }
    case 'connected': {
      // An account already connected is the pick (dev acceptance 11/10, finding 4: a Done step must
      // not ask to connect another vendor). It replaces a scan's pick, never a pick by hand, and a
      // pick already among the connected ones stays.
      const first = action.ids[0]
      if (first === undefined || state.pickedByHand) return state
      if (state.picked !== null && action.ids.includes(state.picked)) return state
      return { ...state, picked: first }
    }
    case 'detectFailed':
      return state.scan.kind === 'none' ? state : { ...state, scan: { kind: 'failed' } }
    case 'scanStopped':
      return state.scan.kind === 'answered' && !state.scan.detection.scanComplete
        ? { ...state, scan: { kind: 'stopped', detection: state.scan.detection } }
        : state
    case 'rescan':
      return state.scan.kind === 'none' ? state : { ...state, scan: { kind: 'waiting' } }
    case 'dismiss':
      return { ...state, closed: { outcome: 'dismissed', picked: state.picked } }
  }
}

/** What the AI account step shows. */
export interface AccountView {
  /**
   * `found`: some programs found · `popular`: none found (or the scan failed or stopped incomplete)
   * · `looking`: scan not complete and still asked.
   */
  readonly mode: 'found' | 'popular' | 'looking'
  readonly primary: readonly Vendor[]
  readonly more: readonly Vendor[]
  readonly expanded: boolean
  /** The number beside the heading; null while looking. */
  readonly count: number | null
  /** "No AI tools were found on this computer…": only after a complete scan that found none. */
  readonly note: boolean
  /** The picked vendor a complete scan reported `not-found` and that is not connected, or null. */
  readonly warn: Vendor | null
  /** The ids found so far. */
  readonly found: ReadonlySet<string>
  /** This surface scans the computer: false on the web, where Refresh has nothing to do. */
  readonly scans: boolean
}

/**
 * Step 1's grid for a catalogue and a state, the mock's three states:
 * (a) found → the found vendors, the rest behind "Show N more";
 * (b) nothing found after a complete scan → the note and "Popular" (the first six);
 * (c) still looking → what was found so far (or the first six), no note, no count, no warning;
 * a scan stopped incomplete shows (a) or "Popular" with its count, never the note or the warning.
 * A vendor whose status is `unknown`/`unsupported` is drawn like one not found, but never named as
 * "not on this computer": only `not-found` from a complete scan says that. A vendor already
 * connected through the server is usable without a local program, so it is never warned about.
 * @param catalogue - the vendors in the server's order.
 * @param state - the flow state.
 * @param connected - the vendors with an AI account already connected.
 */
export function accountView(
  catalogue: readonly Vendor[],
  state: FlowState,
  connected: readonly string[] = []
): AccountView {
  const scan = state.scan
  const detection = scan.kind === 'answered' || scan.kind === 'stopped' ? scan.detection : null
  const found = detection ? foundIds(detection) : new Set<string>()
  const looking = scan.kind === 'waiting' || (scan.kind === 'answered' && !scan.detection.scanComplete)
  const complete = scan.kind === 'answered' && scan.detection.scanComplete
  const foundList = catalogue.filter((v) => found.has(v.id))
  const hasFound = foundList.length > 0
  // A connected vendor is always in the main grid, never only behind "Show N more".
  const lead = hasFound ? found : new Set(catalogue.slice(0, POPULAR_COUNT).map((v) => v.id))
  const inPrimary = (v: Vendor) => lead.has(v.id) || connected.includes(v.id)
  const primary = catalogue.filter(inPrimary)
  const more = catalogue.filter((v) => !inPrimary(v))
  // A pick living in the collapsed group keeps it open (a one-way latch, as Orca).
  const expanded = state.expanded || more.some((v) => v.id === state.picked)
  const statusOf = (id: string) => detection?.results.find((r) => r.id === id)?.status
  const pickedVendor = catalogue.find((v) => v.id === state.picked) ?? null
  const warn =
    complete &&
    pickedVendor !== null &&
    statusOf(pickedVendor.id) === 'not-found' &&
    !connected.includes(pickedVendor.id)
      ? pickedVendor
      : null
  return {
    mode: looking ? 'looking' : hasFound ? 'found' : 'popular',
    primary,
    more,
    expanded,
    count: looking ? null : primary.length,
    note: complete && !hasFound,
    warn,
    found,
    scans: scan.kind !== 'none'
  }
}

/** macOS's answer about Tracy's notifications, as the screen reads it. */
export type Permission = 'allowed' | 'denied' | 'unknown'

/**
 * The permission in an app's notification status. Only `allowed` and `denied` are taken at their
 * word; anything else (an app that cannot read it, Windows, Linux, an older app) is `unknown`.
 */
export function permissionOf(status: { readonly permission?: unknown } | null | undefined): Permission {
  const permission = status?.permission
  return permission === 'allowed' || permission === 'denied' ? permission : 'unknown'
}

/**
 * Which steps are done, for the "Done" / "Not done" chip beside each title and the check in the
 * checklist (Lee, 11/10/2026): signing in always (this screen draws only after sign-in); the AI
 * account when one is connected (the status door's `connections`, or a connect just now);
 * appearance & language always (both have a value chosen already); notifications when Tracy's
 * switch is on, the system offers them, and macOS does not block them.
 */
export function stepsDone(input: {
  /** Any AI account connected. */
  readonly connected: boolean
  readonly notify: {
    readonly supported: boolean
    readonly enabled: boolean
    readonly permission?: unknown
  } | null
}): readonly [boolean, boolean, boolean, boolean] {
  const notify = input.notify
  return [
    true,
    input.connected,
    true,
    notify !== null && notify.supported && notify.enabled && permissionOf(notify) !== 'denied'
  ]
}

/** Where a panel starts once its data arrived: the first step not done, or step 1 when all are. */
export function firstUndone(done: readonly boolean[]): number {
  const index = done.indexOf(false)
  return index === -1 ? 0 : index
}
