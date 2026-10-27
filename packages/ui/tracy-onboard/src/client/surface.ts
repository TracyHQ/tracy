/**
 * Where the first-run screen runs, as the screen needs it: where "closed it" and "hidden from the
 * account menu" are kept, and which of the desktop-only parts exist (tasks/todo-web-onboard.md,
 * ADR 0030 — web first, the app adds only what the web cannot do).
 *
 * - The web: the account keeps both (`GET/POST /api/onboarding`, `POST /api/onboarding/menu-hide`
 *   and `menu-show`, `apps/tracy-web/src/onboarding/route.js`). No scan of the computer and no notifications step: a
 *   browser can do neither today, and a step promising a feature the web lacks would be invented
 *   (CLAUDE.md §0.3).
 * - The desktop app (bridge protocol 2, `bridge.ts`): the account decides whether the screen shows.
 *   Closing also keeps the device record (`app.onboarding`) for the sign-in frame. The menu flag
 *   is the account's on both surfaces (plan G5): hiding the row in the app
 *   hides it on the web too. The app adds the scan and the notifications step.
 */
import type { NotifyStatus, OnboardApp } from './bridge.ts'
import { STEP_COUNT, type Closed } from './flow.ts'

/** The two flags of the Getting started screen, as milliseconds; null = never. */
export interface OnboardFlags {
  /** null = never closed: show the screen on load. */
  readonly closedAt: number | null
  /** null = the account menu still shows the Getting started row. */
  readonly menuHiddenAt: number | null
}

/** Where "closed the screen" and "hidden from the account menu" are kept. */
export interface OnboardStore {
  /** Rejects when nobody can tell (then nothing shows). */
  get(): Promise<OnboardFlags>
  close(input: Closed): Promise<unknown>
  /** "Hide from account menu": best effort, never rejects (a refused door only loses the flag). */
  hideMenu(): Promise<void>
  /** "Show in account menu": clears the hide; best effort, never rejects, like `hideMenu`. */
  showMenu(): Promise<void>
}

export interface OnboardSurface {
  readonly onboarding: OnboardStore
  /** The scan of this computer; absent on the web. */
  readonly agents?: OnboardApp['agents']
  /** The notifications step; absent on the web (no agent-finished notification there yet). */
  readonly notifications?: OnboardApp['notifications']
}

/** The web's step count: Sign in, AI account, Appearance & language. */
export const WEB_STEPS = 3

/** How many steps a surface shows: the notifications step only where notifications exist. */
export const stepsOf = (surface: OnboardSurface): number =>
  surface.notifications === undefined ? WEB_STEPS : STEP_COUNT

type Fetch = (url: string, init?: RequestInit) => Promise<Response>

/** The account's door (`apps/tracy-web/src/onboarding/route.js`). */
export const ONBOARDING_DOOR = '/api/onboarding'
/** The same door's "hide the Getting started row" action (no body, idempotent). */
export const MENU_HIDE_DOOR = '/api/onboarding/menu-hide'
/** The same door's "show it again" action (no body, idempotent). */
export const MENU_SHOW_DOOR = '/api/onboarding/menu-show'

/** An ISO time as milliseconds; null for null, absent or unreadable (an older door sends none). */
function timeOf(value: unknown): number | null {
  if (typeof value !== 'string') return null
  const time = Date.parse(value)
  return Number.isNaN(time) ? null : time
}

/** Warned once per page and door: a menu flag that did not stick is not worth a line per click. */
const warned = new Set<string>()

/** POST one of the menu doors; a refusal or no network is warned once and swallowed. */
async function postMenuFlag(fetchFn: Fetch, door: string): Promise<void> {
  try {
    const response = await fetchFn(door, { method: 'POST', credentials: 'same-origin' })
    if (!response.ok) throw new Error(`answered ${response.status}`)
  } catch (error) {
    if (!warned.has(door)) console.warn('tracy-onboard: the menu flag was not recorded', error)
    warned.add(door)
  }
}

/** The account's flags: `{completedAt, menuHiddenAt}` read, a close or a hide recorded. */
export function accountStore(fetchFn: Fetch = (url, init) => fetch(url, init)): OnboardStore {
  return {
    async get() {
      const response = await fetchFn(ONBOARDING_DOOR, { credentials: 'same-origin', cache: 'no-store' })
      if (!response.ok) throw new Error(`onboarding door answered ${response.status}`)
      const body = (await response.json()) as { completedAt?: unknown; menuHiddenAt?: unknown } | null
      const at = body?.completedAt
      if (at !== null && timeOf(at) === null) throw new Error('onboarding door gave no readable answer')
      return { closedAt: timeOf(at), menuHiddenAt: timeOf(body?.menuHiddenAt) }
    },
    async close() {
      // No body: the door records "closed now" for the session's account, the first time only.
      const response = await fetchFn(ONBOARDING_DOOR, { method: 'POST', credentials: 'same-origin' })
      if (!response.ok) throw new Error(`onboarding door answered ${response.status}`)
    },
    hideMenu: () => postMenuFlag(fetchFn, MENU_HIDE_DOOR),
    showMenu: () => postMenuFlag(fetchFn, MENU_SHOW_DOOR)
  }
}

/** The web: the account decides, three steps, no scan. */
export function webSurface(fetchFn?: Fetch): OnboardSurface {
  return { onboarding: accountStore(fetchFn) }
}

/** The desktop app: the account decides both flags; the device still records each close. */
export function desktopSurface(app: OnboardApp, fetchFn?: Fetch): OnboardSurface {
  const account = accountStore(fetchFn)
  return {
    agents: app.agents,
    notifications: app.notifications,
    onboarding: {
      get: () => account.get(),
      close: (input) => {
        // The account's record never holds up or fails the device's.
        account.close(input).catch(() => {})
        return app.onboarding.close(input)
      },
      hideMenu: () => account.hideMenu(),
      showMenu: () => account.showMenu()
    }
  }
}

export type { NotifyStatus }
