/**
 * The part of the desktop app's bridge this screen talks to: `window.tracyDesktop.app`, protocol 2
 * (tasks/todo-desktop-onboard-agent.md "Preload bridge contract"; main-process side in
 * `packages/desktop/tracy-desktop/src/{agents,onboarding,notify}-bridge.js`).
 *
 * The web has no bridge and an app older than protocol 2 has none of these parts: both get
 * `undefined`, and the plugin draws nothing.
 */
import type { Closed, Detection } from './flow.ts'

/** The bridge protocol that first carries `agents`, `onboarding` and `notifications`. */
export const ONBOARD_PROTOCOL = 2

/** Whether this device closed the first-run screen (`<userData>/preferences.json`). */
export interface OnboardingState {
  readonly flowVersion: number
  readonly closedAt: number | null
  readonly outcome: 'completed' | 'dismissed' | null
  readonly picked: string | null
}

/**
 * System notifications as the main process sees them. `permission` is macOS's answer
 * (tasks/todo-desktop-onboard-v2.md contract 7): `allowed`, `denied`, or `unknown` (Windows, Linux,
 * an app that cannot read it). Read it through flow.ts `permissionOf`: any other value is unknown.
 */
export interface NotifyStatus {
  readonly supported: boolean
  readonly enabled: boolean
  readonly permission: string
  readonly lastShownAt: number | null
  /** 'system' = System Default, else a macOS alert sound's name. Absent from an app that has no picker. */
  readonly sound?: string
  /** false = this computer has nowhere to open notification settings (Linux without GNOME); absent on older apps. */
  readonly settingsTarget?: boolean
}

export interface OnboardApp {
  readonly protocolVersion: number
  readonly agents: {
    detect(ids: string[]): Promise<Detection>
    refresh(ids: string[]): Promise<Detection>
  }
  readonly onboarding: {
    get(): Promise<OnboardingState>
    close(input: Closed): Promise<OnboardingState>
    /**
     * The app's Help menu "Getting started with Tracy Cowork" (push channel
     * `tracy-desktop:onboarding-open`); returns the unsubscribe. Absent from an app built before it.
     */
    onOpen?(watcher: () => void): () => void
  }
  readonly notifications: {
    status(): Promise<NotifyStatus>
    setEnabled(on: boolean): Promise<NotifyStatus>
    test(): Promise<NotifyStatus>
    openSystemSettings(): Promise<void>
    /** Optional: an app without the sound picker lacks it, and the screen hides the picker. */
    setSound?(name: string): Promise<NotifyStatus>
    /**
     * Optional: the status again whenever it changed (the app rereads the permission when its window
     * gets the focus, e.g. back from System Settings); returns the unsubscribe. Absent on older apps.
     */
    onChange?(listener: (status: NotifyStatus) => void): () => void
  }
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object'

const hasMethods = (value: unknown, names: readonly string[]): boolean =>
  isObject(value) && names.every((name) => typeof value[name] === 'function')

/**
 * The desktop app's bridge on `win` when it speaks protocol 2 with every part this screen uses, or
 * undefined (a browser, an older app, a page outside the app).
 */
export function onboardApp(win: unknown): OnboardApp | undefined {
  const app = (win as { tracyDesktop?: { app?: unknown } } | undefined)?.tracyDesktop?.app
  if (!isObject(app)) return undefined
  if (typeof app.protocolVersion !== 'number' || app.protocolVersion < ONBOARD_PROTOCOL) return undefined
  if (!hasMethods(app.agents, ['detect', 'refresh'])) return undefined
  if (!hasMethods(app.onboarding, ['get', 'close'])) return undefined
  if (!hasMethods(app.notifications, ['status', 'setEnabled', 'test', 'openSystemSettings'])) return undefined
  return app as unknown as OnboardApp
}

/**
 * Open a page in the person's browser through the app's links (`tracyDesktop.links.openExternal`),
 * as `@tracy/dsh-model-plan` `device-sign-in.ts` does; a new tab outside the app.
 */
export function openExternal(url: string): void {
  const links = (window as { tracyDesktop?: { links?: { openExternal?: unknown } } }).tracyDesktop?.links
  if (typeof links?.openExternal === 'function') (links.openExternal as (url: string) => void)(url)
  else window.open(url, '_blank', 'noopener,noreferrer')
}
