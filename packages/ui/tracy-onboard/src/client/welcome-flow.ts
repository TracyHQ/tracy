/**
 * The first-run "Welcome to Tracy" popup, the parts that are not drawing (Welcome.tsx draws):
 * whether the account has seen it, the eight scenes and where their frames load from, and where the
 * last scene's call to action leads.
 *
 * - Seen or not is the ACCOUNT's, on every browser and in the desktop app: the `welcome` mark of
 *   `/api/seen-hints` (`apps/tracy-web/src/seen-hints/`), the same door as the site tour's and the
 *   voice tip's. An answer nobody can read counts as seen: a popup that might repeat on every load
 *   is worse than one that never shows.
 * - The scenes are a small static site served by tracy-web (`apps/tracy-web/src/welcome/route.js`),
 *   loaded in the popup's frame only while the popup is open, so the plugin bundle carries none of
 *   their weight.
 */

/** The account's one-time mark for this popup (`SEEN_HINTS` in `apps/tracy-web/src/seen-hints/store.js`). */
export const WELCOME_HINT = 'welcome'

/** The account's door for one-time marks. */
export const SEEN_HINTS_DOOR = '/api/seen-hints'

/** Where tracy-web serves the scenes (`WELCOME_SCENES_PATH` in `apps/tracy-web/src/welcome/route.js`). */
export const SCENES_BASE = '/welcome/scenes/'

/** The creation workspace, where Add site lives, and the address that opens Add site there. */
export const CREATION_PATH = '/new/'
export const ADD_SITE_ADDRESS = '/new/?tab=tracy:add-site'

/** The event the creation workspace's start cards answer (`@tracy/dsh-chat-input` `onboarding-start.ts`). */
export const ONBOARDING_START_EVENT = 'tracy:onboarding-start'

/** One scene: which replay the frame plays. Copy is `welcome.<n>.title` / `.body` in strings.ts. */
export interface Scene {
  /** The Add site replay (`addsite/index.html?flow=`) … */
  readonly flow?: 'import' | 'create' | 'system' | 'customize'
  /** … or a tab of the app replay (`engine.html?tab=`). */
  readonly tab?: number
  readonly changes?: boolean
  readonly publish?: boolean
  /** The last scene: offers the call to action once its replay has ended. */
  readonly ready?: boolean
}

/** The approved order of the prototype (bao-cao/onboarding-tracy/welcome-popup.html, 25/10/2026). */
export const SCENES: readonly Scene[] = Object.freeze([
  { tab: 2 },
  { flow: 'import' },
  { flow: 'create' },
  { flow: 'system' },
  { flow: 'customize' },
  { tab: 3 },
  { tab: 2, changes: true },
  { tab: 2, publish: true, ready: true }
])

/** The frame's address for one scene, theme and motion (the replays read these parameters). */
export function sceneAddress(
  scene: Scene,
  theme: 'light' | 'dark',
  reduced: boolean,
  base = SCENES_BASE
): string {
  const params = new URLSearchParams({ theme, motion: reduced ? 'reduced' : 'full', rev: '1' })
  if (scene.flow) params.set('flow', scene.flow)
  else params.set('tab', String(scene.tab))
  if (scene.changes) params.set('changes', '1')
  if (scene.publish) params.set('publish', '1')
  return `${base}${scene.flow ? 'addsite/index.html' : 'engine.html'}?${params}`
}

type Fetch = (url: string, init?: RequestInit) => Promise<Response>

/** Where the welcome mark is read and written. */
export interface WelcomeStore {
  /** true when the account has seen it; rejects when nobody can tell. */
  seen(): Promise<boolean>
  /** Best effort, never rejects: a refused write only means the popup may show once more. */
  record(): Promise<void>
}

export function welcomeStore(fetchFn: Fetch = (url, init) => fetch(url, init)): WelcomeStore {
  return {
    async seen() {
      const response = await fetchFn(SEEN_HINTS_DOOR, { credentials: 'same-origin', cache: 'no-store' })
      if (!response.ok) throw new Error(`seen-hints door answered ${response.status}`)
      const body = (await response.json()) as { hints?: unknown } | null
      if (!Array.isArray(body?.hints)) throw new Error('seen-hints door gave no readable answer')
      return body.hints.includes(WELCOME_HINT)
    },
    async record() {
      try {
        const response = await fetchFn(SEEN_HINTS_DOOR, {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ hint: WELCOME_HINT })
        })
        if (!response.ok) throw new Error(`answered ${response.status}`)
      } catch (error) {
        console.warn('tracy-onboard: the welcome mark was not recorded', error)
      }
    }
  }
}

/**
 * Open Add site on its Create card: in the creation workspace through the start cards' own event
 * (the same press as "Create a new site"), anywhere else by going to the workspace with the tab named
 * on the address (`@tracy/dsh-tab-link` opens it).
 */
export function openAddSite(
  win: Pick<Window, 'dispatchEvent'> & { location: Pick<Location, 'assign'> },
  baseURI: string
): void {
  let path = ''
  try {
    path = new URL(baseURI).pathname
  } catch {
    path = ''
  }
  if (path === CREATION_PATH) {
    win.dispatchEvent(new CustomEvent(ONBOARDING_START_EVENT, { detail: { action: 'create' } }))
    return
  }
  win.location.assign(ADD_SITE_ADDRESS)
}
