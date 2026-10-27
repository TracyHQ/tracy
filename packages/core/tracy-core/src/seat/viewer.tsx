/**
 * The person signed in on this page — one store for every Tracy surface that names them (the
 * account menu, Settings › Account, the /ops avatar), read from `GET /auth/me`
 * (`apps/tracy-web/src/identity/route.js`): `{ email, name, face, defaultSite }`.
 *
 * ## One read per PAGE, not per plugin
 *
 * `@tracy/core` is bundled into each plugin's client, so a module-level variable here would be one
 * per plugin: five plugins, five reads of the door, five answers that may disagree. The store hangs
 * on the document instead, under `Symbol.for('tracy.viewer')` — the way `site-tabs/Popover.tsx`
 * shares its open-menu list — and the first bundle to ask builds it. The raw answer is shared one
 * level lower (`viewerDoorAnswer` in `./index.mjs`), so `readViewer()` rides the same request.
 *
 * 🔒 THIS FILE IMPORTS REACT AND TYPES ONLY — no `@tracy/ui`, no CSS. It is bundled into mode-B
 * plugins; `../team/face.tsx`'s header says why that build must not pull a stylesheet.
 */
import { useSyncExternalStore } from 'react'
import type { PersonFace } from '../team/face'
import { forgetViewerAnswer, GUEST, pageHolder, SEAT, viewerDoorAnswer, viewerFromAnswer } from './index.mjs'

/** Who is looking at the page. `loading` until the door answers; `error` when it could not say. */
export interface Viewer {
  state: 'loading' | 'guest' | 'signedIn' | 'error'
  email: string | null
  name: string | null
  face: PersonFace | null
}

export interface ViewerStore {
  /** The current viewer: the same object until it changes, as `useSyncExternalStore` needs. */
  get(): Viewer
  subscribe(listener: () => void): () => void
  /** Ask the door again (after a rename, a sign-in); every bundle on the page hears the answer. */
  refresh(): Promise<void>
}

/** What the page holder keeps: the public store plus the one write `signOut` needs. */
interface SharedStore extends ViewerStore {
  clear(): void
}

const VIEWER = Symbol.for('tracy.viewer')

/** How long a viewer in `error` waits before its one retry. */
const ERROR_RETRY_MS = 3000

const LOADING: Viewer = { state: 'loading', email: null, name: null, face: null }
const GUEST_VIEWER: Viewer = { state: 'guest', email: null, name: null, face: null }
const ERROR_VIEWER: Viewer = { state: 'error', email: null, name: null, face: null }

/** A face as the server sends it, or null for anything else. */
function faceFrom(value: unknown): PersonFace | null {
  if (value === null || typeof value !== 'object') return null
  const face = value as Record<string, unknown>
  if (typeof face.initial !== 'string' || typeof face.color !== 'string') return null
  return {
    initial: face.initial,
    color: face.color,
    avatarUrl: typeof face.avatarUrl === 'string' ? face.avatarUrl : null
  }
}

/** The door's answer as a viewer; `readViewer`'s own reading decides signed-in / guest / unknown. */
function viewerFrom(answer: { status: number; body: unknown } | null): Viewer {
  if (answer === null) return ERROR_VIEWER
  const kind = viewerFromAnswer(answer.status, answer.body)
  if (kind === GUEST) return GUEST_VIEWER
  if (kind !== SEAT) return ERROR_VIEWER
  const body = answer.body as Record<string, unknown>
  const name = typeof body.name === 'string' && body.name.trim() !== '' ? body.name.trim() : null
  return { state: 'signedIn', email: body.email as string, name, face: faceFrom(body.face) }
}

function createStore(): SharedStore {
  let current = LOADING
  const listeners = new Set<() => void>()
  // Each read takes a number; only the latest one may write, so a slow answer never overwrites a
  // newer one (a refresh, or a sign-out that cleared the store meanwhile).
  let latest = 0
  const set = (next: Viewer) => {
    current = next
    for (const listener of listeners) listener()
  }
  // A viewer in error asks once more, a moment later: a door that blinked while the page loaded
  // (a deploy, a dropped connection) would otherwise leave a grey face for the life of the page.
  let retried = false
  const load = async (fresh: boolean) => {
    const mine = ++latest
    const answer = await viewerDoorAnswer({ fresh })
    if (mine !== latest) return
    const next = viewerFrom(answer)
    set(next)
    if (next.state !== 'error' || retried) return
    retried = true
    setTimeout(() => {
      if (mine === latest) void load(true)
    }, ERROR_RETRY_MS)
  }
  const store: SharedStore = {
    get: () => current,
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    refresh: () => load(true),
    clear() {
      latest += 1
      forgetViewerAnswer()
      set(GUEST_VIEWER)
    }
  }
  void load(false)
  return store
}

function sharedStore(): SharedStore {
  const holder = pageHolder()
  let store = holder[VIEWER] as SharedStore | undefined
  if (store === undefined) {
    store = createStore()
    holder[VIEWER] = store
  }
  return store
}

/** The page's viewer store, built (and the door asked) by whichever bundle asks first. */
export function viewerStore(): ViewerStore {
  return sharedStore()
}

/**
 * The viewer, kept current: re-renders when the door answers, on `refresh()`, on `signOut()`, and
 * on the one retry 3 s after a read that ended in `error`.
 */
export function useViewer(): Viewer {
  const store = sharedStore()
  return useSyncExternalStore(store.subscribe, store.get, store.get)
}

/**
 * Sign out through tracy-web's door, which clears the session, site and lane cookies alike
 * (dsh-passwords' own "Sign out" only drops the lane cookie, and the next navigation mints a new
 * one). The store is cleared first, so nothing on the page keeps naming the person meanwhile.
 */
export async function signOut(): Promise<void> {
  if (
    window.location.pathname === '/widget/native' ||
    window.location.pathname?.startsWith('/widget/native/')
  ) {
    const response = await fetch('/widget/api/native/logout', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: '{}'
    })
    if (!response.ok || (await response.json()).ok !== true) throw Error('WIDGET_NATIVE_SIGN_OUT_FAILED')
    sharedStore().clear()
    window.parent.postMessage({ type: 'tracy-widget-native-signed-out' }, window.location.origin)
    window.location.replace('/widget?reauth=1')
    return
  }
  sharedStore().clear()
  try {
    await fetch('/auth/signout', { method: 'POST', credentials: 'same-origin' })
  } catch {
    // Best effort; leaving for the sign-in door is what ends the session for the person either way.
  }
  window.location.replace('/login')
}
