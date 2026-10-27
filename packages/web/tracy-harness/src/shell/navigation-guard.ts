const HISTORY_KEY = '__tracyOpsNavigation'
type Position = { session: string; index: number }
// This is a history lineage label, not a security token. It also works on plain
// HTTP development origins, where crypto.randomUUID is not exposed.
const newPosition = (): Position => ({ session: `${Date.now()}-${Math.random()}`, index: 0 })

function position(state: unknown): Position | null {
  const value = state && typeof state === 'object' ? (state as Record<string, unknown>)[HISTORY_KEY] : null
  if (!value || typeof value !== 'object') return null
  const candidate = value as Position
  return typeof candidate.session === 'string' && Number.isSafeInteger(candidate.index) ? candidate : null
}

/** A screen can cancel this event to retain its unsaved state. The router owns
 * history restoration, so a rejected traversal does not unmount that screen. */
export function createOpsNavigation(
  win: Window & { Event: typeof Event },
  changed: (kind: 'navigate' | 'pop') => void
) {
  let current = position(win.history.state) ?? newPosition()
  let currentUrl = win.location.href
  let currentState = win.history.state
  let restoring = false
  const tagged = (state: unknown) => ({
    ...(state && typeof state === 'object' ? state : {}),
    [HISTORY_KEY]: current
  })
  currentState = tagged(currentState)
  win.history.replaceState(currentState, '', currentUrl)

  const allowed = () => win.dispatchEvent(new win.Event('tracy:before-ops-navigation', { cancelable: true }))
  const restore = (target: Position | null) => {
    if (target?.session === current.session && target.index !== current.index) {
      restoring = true
      win.history.go(current.index - target.index)
    } else {
      // Old or foreign entries have no trustworthy direction/distance. Keep the
      // editor and URL, and begin a fresh index lineage instead of guessing go().
      current = newPosition()
      currentState = tagged(currentState)
      win.history.replaceState(currentState, '', currentUrl)
      restoring = false
    }
  }
  const onPop = (event: PopStateEvent) => {
    const target = position(event.state)
    if (restoring) {
      if (target?.session === current.session && target.index === current.index) restoring = false
      else restore(target)
      return
    }
    if (!allowed()) {
      restore(target)
      return
    }
    current = target ?? newPosition()
    currentUrl = win.location.href
    currentState = tagged(event.state)
    win.history.replaceState(currentState, '', currentUrl)
    changed('pop')
  }
  win.addEventListener('popstate', onPop)
  return {
    navigate(url: string, replace = false) {
      if (restoring) return false
      const nextUrl = new URL(url, win.location.href).href
      if (nextUrl === currentUrl) return true
      if (!allowed()) return false
      current = { ...current, index: current.index + (replace ? 0 : 1) }
      currentState = tagged(replace ? currentState : {})
      if (replace) win.history.replaceState(currentState, '', url)
      else win.history.pushState(currentState, '', url)
      currentUrl = win.location.href
      changed('navigate')
      return true
    },
    dispose() {
      win.removeEventListener('popstate', onPop)
    }
  }
}
